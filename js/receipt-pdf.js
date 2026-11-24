export async function makeReceiptPdf(receipt) {
  const logoImage = await new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('The Furgo logo could not be loaded.'));
    image.src = 'Image/Icon/Logo%202.png';
  });
  const logoCanvas = document.createElement('canvas');
  logoCanvas.width = 267;
  logoCanvas.height = 267;
  const logoContext = logoCanvas.getContext('2d');
  // Preserve the complete Logo 2 artwork and its native transparent background.
  logoContext.drawImage(logoImage, 0, 0, logoCanvas.width, logoCanvas.height);
  const logoPixels = logoContext.getImageData(0, 0, logoCanvas.width, logoCanvas.height).data;
  const rgbPixels = new Uint8Array(logoCanvas.width * logoCanvas.height * 3);
  const alphaPixels = new Uint8Array(logoCanvas.width * logoCanvas.height);
  for (let pixel = 0; pixel < alphaPixels.length; pixel += 1) {
    rgbPixels[pixel * 3] = logoPixels[pixel * 4];
    rgbPixels[pixel * 3 + 1] = logoPixels[pixel * 4 + 1];
    rgbPixels[pixel * 3 + 2] = logoPixels[pixel * 4 + 2];
    alphaPixels[pixel] = logoPixels[pixel * 4 + 3];
  }
  const logoHex = [...rgbPixels].map((byte) => byte.toString(16).padStart(2, '0')).join('').toUpperCase();
  const alphaHex = [...alphaPixels].map((byte) => byte.toString(16).padStart(2, '0')).join('').toUpperCase();
  const ascii = (value) => String(value ?? '').normalize('NFKD').replace(/[^\x20-\x7E]/g, '').replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  const commands = ['q', '0.996 0.471 0.004 rg', '0 790 595 52 re f', 'Q', 'q', '84.5 0 0 84.5 43 773.75 cm', '/Logo Do', 'Q'];
  const draw = (font, size, x, y, value, color = '0.16 0.15 0.14 rg') => {
    commands.push(color, `BT /${font} ${size} Tf ${x} ${y} Td (${ascii(value)}) Tj ET`);
  };
  const drawRight = (font, size, right, y, value, color = '0.16 0.15 0.14 rg') => {
    const text = String(value ?? '');
    draw(font, size, right - (text.length * size * 0.52), y, text, color);
  };
  const wrapped = (value, width = 82) => String(value || '').split(/\r?\n/).flatMap((line) => {
    const words = line.split(/\s+/);
    const result = [];
    let current = '';
    words.forEach((word) => {
      if (!word) return;
      if (current && `${current} ${word}`.length > width) { result.push(current); current = word; }
      else current = current ? `${current} ${word}` : word;
    });
    if (current) result.push(current);
    return result;
  });
  draw('F2', 22, 42, 728, 'PAYMENT RECEIPT');
  draw('F1', 10, 42, 706, `Receipt No: ${receipt.receiptNo}`);
  draw('F1', 10, 380, 706, `Date: ${receipt.receiptDate}`);
  const headingRuleY = receipt.isMarketplace ? 688 : 673;
  if (!receipt.isMarketplace) draw('F1', 10, 42, 688, `Receipt Type: ${receipt.receiptType}`);
  commands.push(`0.91 0.85 0.80 RG 42 ${headingRuleY} m 553 ${headingRuleY} l S`);
  draw('F2', 12, 42, headingRuleY - 24, 'BILLED TO');
  draw('F1', 11, 42, headingRuleY - 43, receipt.customerName);
  if (receipt.customerPhone) draw('F1', 10, 42, headingRuleY - 60, `Phone: ${receipt.customerPhone}`);
  if (receipt.customerEmail) draw('F1', 10, 42, headingRuleY - (receipt.customerPhone ? 77 : 60), `Email: ${receipt.customerEmail}`);
  const detailsY = headingRuleY - (receipt.customerPhone || receipt.customerEmail ? 99 : 77);
  draw('F2', 10, 42, detailsY, `Order No: ${receipt.orderNo}`);
  draw('F1', 10, 320, detailsY, `Payment: ${receipt.paymentMethod || '-'}`);
  draw('F1', 10, 42, detailsY - 17, `Status: ${receipt.paymentStatus || '-'}`);
  const tableTop = detailsY - 43;
  commands.push('0.996 0.95 0.91 rg', `42 ${tableTop - 6} 511 24 re f`);
  draw('F2', 10, 50, tableTop + 2, 'ITEMS / DESCRIPTION');
  if (receipt.isMarketplace) {
    draw('F2', 9, 397, tableTop + 2, 'QTY');
    drawRight('F2', 9, 545, tableTop + 2, 'PRICE (MYR)');
  } else draw('F2', 10, 475, tableTop + 2, 'AMOUNT');
  let y = tableTop - 24;
  if (receipt.isMarketplace) {
    const items = Array.isArray(receipt.marketplaceItems) ? receipt.marketplaceItems : [];
    items.slice(0, 14).forEach((item) => {
      const descriptionLines = wrapped(item.description, 52).slice(0, 3);
      descriptionLines.forEach((line, index) => draw('F1', 9, 50, y - index * 12, line));
      drawRight('F1', 9, 423, y, String(Math.max(1, Number(item.quantity) || 1)));
      drawRight('F1', 9, 545, y, Number(item.price || 0).toFixed(2));
      y -= Math.max(17, descriptionLines.length * 12) + 4;
    });
  } else {
    const itemLines = wrapped(receipt.items, 72).slice(0, 16);
    itemLines.forEach((line) => { draw('F1', 10, 50, y, line); y -= 17; });
  }
  y -= 5;
  commands.push(`0.91 0.85 0.80 RG 330 ${y} m 553 ${y} l S`);
  y -= 21;
  [['Subtotal', receipt.subtotal], ['Discount', receipt.discount], ['Delivery', receipt.delivery]].forEach(([label, amount]) => {
    draw('F1', 10, 360, y, label);
    draw('F1', 10, 492, y, label === 'Discount' ? `- MYR ${Number(amount).toFixed(2)}` : `MYR ${Number(amount).toFixed(2)}`);
    y -= 18;
  });
  commands.push(`0.91 0.85 0.80 RG 330 ${y + 5} m 553 ${y + 5} l S`);
  y -= 17;
  draw('F2', 13, 360, y, 'TOTAL PAID');
  draw('F2', 13, 480, y, `MYR ${Number(receipt.total).toFixed(2)}`, '0.996 0.36 0 rg');
  draw('F1', 9, 42, 64, `Issued by ${receipt.issuedBy || 'Furgo'} · Thank you for choosing Furgo.`);
  const stream = `${commands.join('\n')}\n`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> /XObject << /Logo 7 0 R >> >> /Contents 6 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}endstream`,
    `<< /Type /XObject /Subtype /Image /Width 267 /Height 267 /ColorSpace /DeviceRGB /BitsPerComponent 8 /SMask 8 0 R /Filter /ASCIIHexDecode /Length ${logoHex.length + 1} >>\nstream\n${logoHex}>\nendstream`,
    `<< /Type /XObject /Subtype /Image /Width 267 /Height 267 /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /ASCIIHexDecode /Length ${alphaHex.length + 1} >>\nstream\n${alphaHex}>\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => { pdf += `${String(offset).padStart(10, '0')} 00000 n \n`; });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return pdf;
}
