/* ── cropper.js — reusable circular image cropper ──
   Exposes window.openImageCropper(file, callback). callback receives a
   cropped File (JPEG) ready to upload. Reuses the .image-cropper-* CSS
   classes already defined in main.css — this UI existed before and was
   simply never wired up to any upload flow after the profile overhaul. */
(function () {
  let overlay, modal, stage, img, zoomInput, saveBtn, cancelBtn;
  let dragging = false;
  let dragStartMouse = { x: 0, y: 0 };
  let dragStartCenter = { x: 0, y: 0 };
  let center = { x: 0, y: 0 };
  let zoom = 1, baseWidth = 0, baseHeight = 0;
  const stageSize = 280;
  let currentCallback = null;
  let currentFile = null;

  function ensureModal() {
    if (overlay) return;

    overlay = document.createElement("div");
    overlay.className = "image-cropper-overlay";

    modal = document.createElement("div");
    modal.className = "image-cropper-modal";
    modal.innerHTML = `
      <h2><i class="ti ti-crop" aria-hidden="true"></i> Adjust Your Photo</h2>
      <p>Drag to reposition, use the slider to zoom.</p>
      <div class="image-cropper-stage" id="cropperStage">
        <img id="cropperImage" alt="Crop preview" draggable="false" />
      </div>
      <div class="image-cropper-zoom-row">
        <i class="ti ti-zoom-out" aria-hidden="true"></i>
        <input type="range" id="cropperZoom" min="1" max="3" step="0.01" value="1" />
        <i class="ti ti-zoom-in" aria-hidden="true"></i>
      </div>
      <div class="image-cropper-actions">
        <button type="button" class="secondary-button" id="cropperCancelBtn" style="width:auto;padding:10px 18px;">
          <i class="ti ti-x" aria-hidden="true"></i> Cancel
        </button>
        <button type="button" class="primary-button" id="cropperSaveBtn" style="width:auto;padding:10px 18px;">
          <i class="ti ti-check" aria-hidden="true"></i> Use Photo
        </button>
      </div>`;

    document.body.appendChild(overlay);
    document.body.appendChild(modal);

    stage     = modal.querySelector("#cropperStage");
    img       = modal.querySelector("#cropperImage");
    zoomInput = modal.querySelector("#cropperZoom");
    saveBtn   = modal.querySelector("#cropperSaveBtn");
    cancelBtn = modal.querySelector("#cropperCancelBtn");

    stage.style.width  = stageSize + "px";
    stage.style.height = stageSize + "px";
    stage.style.margin = "0 auto";
    stage.style.borderRadius = "50%";

    stage.addEventListener("mousedown", (e) => {
      dragging = true;
      dragStartMouse = { x: e.clientX, y: e.clientY };
      dragStartCenter = { ...center };
    });
    window.addEventListener("mousemove", (e) => {
      if (!dragging) return;
      center = {
        x: dragStartCenter.x + (e.clientX - dragStartMouse.x),
        y: dragStartCenter.y + (e.clientY - dragStartMouse.y)
      };
      render();
    });
    window.addEventListener("mouseup", () => { dragging = false; });

    /* Basic touch support so this also works on mobile. */
    stage.addEventListener("touchstart", (e) => {
      const t = e.touches[0];
      dragging = true;
      dragStartMouse = { x: t.clientX, y: t.clientY };
      dragStartCenter = { ...center };
    }, { passive: true });
    window.addEventListener("touchmove", (e) => {
      if (!dragging || !e.touches.length) return;
      const t = e.touches[0];
      center = {
        x: dragStartCenter.x + (t.clientX - dragStartMouse.x),
        y: dragStartCenter.y + (t.clientY - dragStartMouse.y)
      };
      render();
    }, { passive: true });
    window.addEventListener("touchend", () => { dragging = false; });

    zoomInput.addEventListener("input", () => {
      zoom = Number(zoomInput.value);
      render();
    });

    cancelBtn.addEventListener("click", closeCropper);
    overlay.addEventListener("click", closeCropper);
    saveBtn.addEventListener("click", saveCrop);
  }

  function render() {
    const width  = baseWidth * zoom;
    const height = baseHeight * zoom;
    img.style.width  = `${width}px`;
    img.style.height = `${height}px`;
    img.style.left = `${center.x - width / 2}px`;
    img.style.top  = `${center.y - height / 2}px`;
  }

  function openCropper(file, callback) {
    ensureModal();
    currentCallback = callback;
    currentFile = file;

    const reader = new FileReader();
    reader.onload = (e) => {
      img.onload = () => {
        const naturalW = img.naturalWidth;
        const naturalH = img.naturalHeight;
        const minDim = Math.min(naturalW, naturalH);
        const fitScale = stageSize / minDim;
        baseWidth  = naturalW * fitScale;
        baseHeight = naturalH * fitScale;
        zoom = 1;
        zoomInput.value = 1;
        center = { x: stageSize / 2, y: stageSize / 2 };
        render();
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);

    overlay.classList.add("open");
    modal.classList.add("open");
  }

  function closeCropper() {
    overlay?.classList.remove("open");
    modal?.classList.remove("open");
    currentCallback = null;
    currentFile = null;
  }

  function saveCrop() {
    const outputSize = 500;
    const canvas = document.createElement("canvas");
    canvas.width = outputSize;
    canvas.height = outputSize;
    const ctx = canvas.getContext("2d");

    ctx.beginPath();
    ctx.arc(outputSize / 2, outputSize / 2, outputSize / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();

    const scaleOut = outputSize / stageSize;
    const left   = parseFloat(img.style.left) * scaleOut;
    const top    = parseFloat(img.style.top) * scaleOut;
    const width  = parseFloat(img.style.width) * scaleOut;
    const height = parseFloat(img.style.height) * scaleOut;

    ctx.drawImage(img, left, top, width, height);

    canvas.toBlob((blob) => {
      if (!blob) return;
      const cb = currentCallback;
      const baseName = (currentFile?.name || "profile").replace(/\.[^.]+$/, "");
      const croppedFile = new File([blob], `${baseName}-cropped.jpg`, { type: "image/jpeg" });
      closeCropper();
      cb && cb(croppedFile);
    }, "image/jpeg", 0.92);
  }

  window.openImageCropper = openCropper;
})();