(() => {
  const libraryUrl = new URL('./vendor/pdfjs/pdf.min.mjs', document.currentScript.src);
  const workerUrl = new URL('./pdf.worker.min.mjs', libraryUrl);
  let library;

  function pdfLibrary() {
    library ??= import(libraryUrl.href).then(pdfjs => {
      pdfjs.GlobalWorkerOptions.workerSrc = workerUrl.href;
      return pdfjs;
    });
    return library;
  }

  function sourceUrl(value) {
    if (!value) return null;
    try {
      const url = new URL(value, document.baseURI);
      const sameOrigin = url.origin === location.origin;
      if (url.username || url.password) return null;
      if (url.protocol === 'https:' || (sameOrigin && ['http:', 'blob:'].includes(url.protocol))) return url;
    } catch {
      return null;
    }
    return null;
  }

  class PairedPdf extends HTMLElement {
    connectedCallback() {
      if (this.reader) return;
      this.innerHTML = `
        <div class="paired-pdf-toolbar" role="group" aria-label="试卷翻页">
          <button type="button" data-prev disabled>上一页</button>
          <span data-page-number aria-live="polite">—</span>
          <button type="button" data-next disabled>下一页</button>
          <button type="button" data-zoom aria-pressed="false" disabled>放大</button>
        </div>
        <p class="paired-pdf-status" role="status">正在加载试卷…</p>
        <div class="paired-pdf-viewport" tabindex="0" role="region" aria-label="试卷页面" hidden>
          <div class="paired-pdf-surface"></div>
        </div>
        <a class="paired-pdf-fallback text-link" target="_blank" rel="noopener noreferrer" hidden>在新页打开试卷 PDF ↗</a>`;

      const reader = this.reader = {
        source: sourceUrl(this.dataset.src),
        page: Math.max(1, Number.parseInt(this.dataset.page, 10) || 1),
        zoom: 1,
        revision: 0,
        prev: this.querySelector('[data-prev]'),
        next: this.querySelector('[data-next]'),
        zoomButton: this.querySelector('[data-zoom]'),
        pageNumber: this.querySelector('[data-page-number]'),
        status: this.querySelector('.paired-pdf-status'),
        viewport: this.querySelector('.paired-pdf-viewport'),
        surface: this.querySelector('.paired-pdf-surface'),
        fallback: this.querySelector('.paired-pdf-fallback')
      };
      if (!reader.source) {
        reader.status.textContent = '试卷 PDF 地址不可用。';
        return;
      }
      reader.fallback.href = reader.source.href;

      reader.prev.addEventListener('click', () => this.changePage(reader, -1));
      reader.next.addEventListener('click', () => this.changePage(reader, 1));
      reader.zoomButton.addEventListener('click', () => {
        reader.zoom = reader.zoom === 1 ? 1.45 : 1;
        reader.zoomButton.setAttribute('aria-pressed', String(reader.zoom !== 1));
        reader.zoomButton.textContent = reader.zoom === 1 ? '放大' : '缩小';
        this.renderPage(reader);
      });
      if (typeof ResizeObserver === 'function') {
        reader.resize = new ResizeObserver(() => {
          cancelAnimationFrame(reader.frame);
          reader.frame = requestAnimationFrame(() => this.renderPage(reader));
        });
        reader.resize.observe(reader.surface);
      }
      if (typeof IntersectionObserver === 'function') {
        reader.visibility = new IntersectionObserver(entries => {
          if (!entries.some(entry => entry.isIntersecting)) return;
          reader.visibility.disconnect();
          this.loadDocument(reader);
        }, { rootMargin: '200px' });
        reader.visibility.observe(this);
      } else {
        this.loadDocument(reader);
      }
    }

    disconnectedCallback() {
      const reader = this.reader;
      if (!reader) return;
      this.reader = null;
      reader.visibility?.disconnect();
      reader.resize?.disconnect();
      cancelAnimationFrame(reader.frame);
      reader.download?.abort();
      reader.render?.cancel();
      reader.loading?.destroy().catch(() => {});
    }

    async loadDocument(reader) {
      try {
        const pdfjs = await pdfLibrary();
        if (this.reader !== reader) return;
        reader.download = new AbortController();
        const deadline = setTimeout(() => reader.download.abort(), 65000);
        let data;
        try {
          const response = await fetch(reader.source.href, {
            credentials: 'omit',
            signal: reader.download.signal
          });
          if (!response.ok) throw new Error('PDF download failed');
          data = await response.arrayBuffer();
        } finally {
          clearTimeout(deadline);
        }
        if (this.reader !== reader) return;
        reader.status.textContent = '正在显示卷面…';
        reader.loading = pdfjs.getDocument({
          data,
          isEvalSupported: false
        });
        reader.document = await reader.loading.promise;
        if (this.reader !== reader) return;
        reader.page = Math.min(reader.page, reader.document.numPages);
        reader.viewport.hidden = false;
        this.updateControls(reader);
        await this.renderPage(reader);
      } catch {
        if (this.reader !== reader) return;
        reader.status.textContent = '试卷 PDF 加载失败。';
        reader.fallback.hidden = false;
      }
    }

    changePage(reader, step) {
      if (!reader.document) return;
      const next = reader.page + step;
      if (next < 1 || next > reader.document.numPages) return;
      reader.page = next;
      reader.viewport.scrollTop = 0;
      this.updateControls(reader);
      this.renderPage(reader);
    }

    updateControls(reader) {
      reader.prev.disabled = reader.page === 1;
      reader.next.disabled = reader.page === reader.document.numPages;
      reader.zoomButton.disabled = false;
      reader.pageNumber.textContent = `第 ${reader.page} 页 / 共 ${reader.document.numPages} 页`;
    }

    async renderPage(reader) {
      if (this.reader !== reader || !reader.document) return;
      const width = reader.surface.clientWidth;
      if (width === 0) return;
      const pageNumber = reader.page;
      const signature = `${pageNumber}/${width}/${reader.zoom}`;
      if (reader.signature === signature) return;
      reader.signature = signature;
      const revision = ++reader.revision;
      const isCurrent = () => this.reader === reader && reader.revision === revision;
      reader.render?.cancel();
      if (reader.renderedPage !== pageNumber) {
        reader.surface.replaceChildren();
        reader.status.textContent = '正在加载试卷页面…';
        reader.status.hidden = false;
      }

      try {
        const page = await reader.document.getPage(pageNumber);
        if (!isCurrent()) return;
        const original = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: width * reader.zoom / original.width });
        const ratio = Math.min(devicePixelRatio || 1, 2, Math.sqrt(5_000_000 / (viewport.width * viewport.height)));
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(viewport.width * ratio);
        canvas.height = Math.ceil(viewport.height * ratio);
        canvas.style.width = `${viewport.width}px`;
        canvas.setAttribute('role', 'img');
        canvas.setAttribute('aria-label', `试卷扫描件第 ${pageNumber} 页`);
        reader.render = page.render({ canvas, viewport, transform: [ratio, 0, 0, ratio, 0, 0] });
        await reader.render.promise;
        if (!isCurrent()) return;
        reader.surface.replaceChildren(canvas);
        reader.renderedPage = pageNumber;
        reader.status.hidden = true;
        reader.fallback.hidden = true;
      } catch (error) {
        if (!isCurrent() || error?.name === 'RenderingCancelledException') return;
        reader.status.textContent = `试卷第 ${pageNumber} 页加载失败。`;
        reader.status.hidden = false;
        reader.fallback.hidden = false;
      }
    }
  }

  customElements.define('paired-pdf', PairedPdf);
})();
