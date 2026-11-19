(() => {
  const databaseName = 'cet6-paired-files';
  const storeName = 'verified-files';

  async function sha256(file) {
    try {
      const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
      return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
    } catch {
      return '';
    }
  }

  window.createPairedFiles = manifest => {
    const known = new Map(Object.entries(manifest || {}).filter(([, file]) =>
      Number.isSafeInteger(file?.size) && file.size > 0 && typeof file.sha256 === 'string' && /^[a-f0-9]{64}$/i.test(file.sha256)
    ));
    const bySize = new Map();
    for (const [id, { size, sha256: digest }] of known) {
      if (!bySize.has(size)) bySize.set(size, new Map());
      const byDigest = bySize.get(size);
      const key = digest.toLowerCase();
      if (!byDigest.has(key)) byDigest.set(key, []);
      byDigest.get(key).push(id);
    }

    const active = new Map();
    let opening;
    let restoration;
    let pending = Promise.resolve();

    function enqueue(work) {
      const result = pending.then(work);
      pending = result.catch(() => {});
      return result;
    }

    function openDatabase() {
      opening ??= new Promise(resolve => {
        try {
          const request = indexedDB.open(databaseName, 1);
          let blocked = false;
          request.onupgradeneeded = () => request.result.createObjectStore(storeName);
          request.onblocked = () => {
            blocked = true;
            resolve(null);
          };
          request.onerror = () => resolve(null);
          request.onsuccess = () => {
            const database = request.result;
            if (blocked) {
              database.close();
              return;
            }
            database.onversionchange = () => {
              database.close();
              opening = undefined;
            };
            resolve(database);
          };
        } catch {
          resolve(null);
        }
      });
      return opening;
    }

    async function transaction(mode, work) {
      const database = await openDatabase();
      if (!database) {
        opening = undefined;
        return null;
      }
      return new Promise(resolve => {
        let tx;
        try {
          tx = database.transaction(storeName, mode);
          tx.onabort = () => resolve(null);
          tx.onerror = () => resolve(null);
          const result = work(tx.objectStore(storeName));
          tx.oncomplete = () => resolve(result);
        } catch {
          tx?.abort();
          resolve(null);
        }
      });
    }

    function url(id) {
      const file = active.get(id);
      if (!file) return '';
      file.url ??= URL.createObjectURL(file.blob);
      return file.url;
    }

    function restore() {
      restoration ??= enqueue(async () => {
        const requests = await transaction('readonly', store =>
          Array.from(known.keys(), id => [id, store.get(id)])
        );
        for (const [id, request] of requests || []) {
          if (active.has(id)) continue;
          const blob = request.result;
          const expected = known.get(id);
          if (blob?.size !== expected.size || await sha256(blob) !== expected.sha256.toLowerCase()) continue;
          active.set(id, { blob, persisted: true });
        }
        return active.size;
      });
      return restoration;
    }

    function importFiles(files) {
      const selected = Array.from(files || []);
      return enqueue(async () => {
        const matched = new Set();
        let unmatched = 0;
        for (const blob of selected) {
          const options = bySize.get(blob?.size);
          const ids = options && options.get(await sha256(blob));
          if (!ids) {
            unmatched += 1;
            continue;
          }
          for (const id of ids) {
            matched.add(id);
            if (!active.has(id)) active.set(id, { blob, persisted: false });
          }
        }

        const unsaved = Array.from(matched).filter(id => !active.get(id).persisted);
        if (unsaved.length) {
          const saved = await transaction('readwrite', store => {
            for (const id of unsaved) store.put(active.get(id).blob, id);
            return true;
          });
          if (saved) {
            for (const id of unsaved) active.get(id).persisted = true;
          }
        }
        const persisted = Array.from(matched).filter(id => active.get(id).persisted).length;
        return { matched: matched.size, unmatched, persisted };
      });
    }

    return { url, restore, importFiles };
  };
})();
