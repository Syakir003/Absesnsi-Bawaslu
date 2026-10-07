const MAX_BYTES = 2 * 1024 * 1024;
const MAX_SIDE = 1280;

function readBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1]);
    r.onerror = () => reject(new Error('Gagal membaca file.'));
    r.readAsDataURL(blob);
  });
}

/** 'image' | 'pdf' | null dari { type, name }. MIME kosong → tebak dari ekstensi. */
export function detectKind(file) {
  if (!file) return null;
  const type = String(file.type || '').toLowerCase();
  if (type === 'application/pdf') return 'pdf';
  if (type === 'image/jpeg' || type === 'image/jpg' || type === 'image/png') return 'image';
  if (type) return null;
  const m = /\.([a-z0-9]+)$/i.exec(String(file.name || ''));
  const ext = m ? m[1].toLowerCase() : '';
  if (ext === 'pdf') return 'pdf';
  if (ext === 'jpg' || ext === 'jpeg' || ext === 'png') return 'image';
  return null;
}

const UNREADABLE = 'Gambar tidak bisa dibaca. Coba pilih file lain.';
const TOO_BIG = 'Gambar terlalu besar untuk diproses. Coba foto ulang dengan resolusi lebih kecil.';

function loadViaImg(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error(UNREADABLE)); };
    img.src = url;
  });
}

/** → { src, width, height, release } ; orientasi EXIF dihormati. */
async function decodeImage(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return { src: bmp, width: bmp.width, height: bmp.height, release: () => bmp.close?.() };
    } catch { /* browser lama / format tak didukung: coba lewat <img> */ }
  }
  const img = await loadViaImg(file);
  return { src: img, width: img.naturalWidth, height: img.naturalHeight, release: () => {} };
}

async function compressImage(file, maxSide = MAX_SIDE, quality = 0.75) {
  const dec = await decodeImage(file);
  try {
    if (!dec.width || !dec.height) throw new Error(UNREADABLE);
    const scale = Math.min(1, maxSide / Math.max(dec.width, dec.height));
    const w = Math.max(1, Math.round(dec.width * scale));
    const h = Math.max(1, Math.round(dec.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error(TOO_BIG);
    ctx.fillStyle = '#fff'; // PNG transparan → latar putih, bukan hitam
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(dec.src, 0, 0, w, h);
    const base64 = canvas.toDataURL('image/jpeg', quality).split(',')[1] || '';
    if (!base64) throw new Error(TOO_BIG);
    if (base64.length * 0.75 > MAX_BYTES) throw new Error('Gambar terlalu besar walau sudah dikompres. Coba foto ulang.');
    return { mime: 'image/jpeg', name: file.name, base64 };
  } finally {
    dec.release();
  }
}

/** File input → { mime, name, base64 }. Gambar dikompres, PDF maks 2 MB. */
export async function prepareUpload(file) {
  if (!file) throw new Error('Pilih file dulu.');
  const kind = detectKind(file);
  if (kind === 'pdf') {
    if (file.size === 0) throw new Error('File PDF kosong.');
    if (file.size > MAX_BYTES) throw new Error('PDF maksimal 2 MB.');
    return { mime: 'application/pdf', name: file.name, base64: await readBase64(file) };
  }
  if (kind === 'image') return compressImage(file);
  throw new Error('Format harus JPG, PNG, atau PDF.');
}
