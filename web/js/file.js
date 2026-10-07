const MAX_BYTES = 2 * 1024 * 1024;

function readBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1]);
    r.onerror = () => reject(new Error('Gagal membaca file.'));
    r.readAsDataURL(blob);
  });
}

async function compressImage(file, maxWidth = 1280, quality = 0.75) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, maxWidth / bmp.width);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
  const base64 = canvas.toDataURL('image/jpeg', quality).split(',')[1];
  if (base64.length * 0.75 > MAX_BYTES) throw new Error('Gambar terlalu besar walau sudah dikompres. Coba foto ulang.');
  return { mime: 'image/jpeg', name: file.name, base64 };
}

/** File input → { mime, name, base64 }. Gambar dikompres, PDF maks 2 MB. */
export async function prepareUpload(file) {
  if (!file) throw new Error('Pilih file dulu.');
  if (file.type === 'application/pdf') {
    if (file.size > MAX_BYTES) throw new Error('PDF maksimal 2 MB.');
    return { mime: file.type, name: file.name, base64: await readBase64(file) };
  }
  if (file.type === 'image/jpeg' || file.type === 'image/png') return compressImage(file);
  throw new Error('Format harus JPG, PNG, atau PDF.');
}
