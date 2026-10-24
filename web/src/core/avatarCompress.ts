/**
 * Center-crops and compresses an image File into a 256x256 JPEG Blob (quality 0.85).
 * Ported from legacy `CC.fileToAvatarBlob` in legacy/index.html L3490-L3510.
 */
export function fileToAvatarBlob(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      try {
        const S = 256;
        const cv = document.createElement('canvas');
        cv.width = S;
        cv.height = S;
        const ctx = cv.getContext('2d');
        if (!ctx) {
          URL.revokeObjectURL(url);
          reject(new Error('canvas context unavailable'));
          return;
        }
        const r = Math.max(S / img.width, S / img.height);
        const w = img.width * r;
        const h = img.height * r;
        ctx.drawImage(img, (S - w) / 2, (S - h) / 2, w, h);
        URL.revokeObjectURL(url);
        cv.toBlob(
          (b) => (b ? resolve(b) : reject(new Error('compress failed'))),
          'image/jpeg',
          0.85
        );
      } catch (e) {
        URL.revokeObjectURL(url);
        reject(e);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('read failed'));
    };
    img.src = url;
  });
}
