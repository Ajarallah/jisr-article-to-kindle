import JSZip from "jszip";

/*
 * Build a tiny, valid EPUB3 used only to verify the delivery path end-to-end
 * (SMTP works + the sender is on the Amazon approved list). Includes a short
 * Arabic RTL line so the user can eyeball Arabic rendering on device.
 */
export async function buildTestEpub() {
  const zip = new JSZip();
  const id = "a2k-test-" + Date.now();
  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
  zip.file(
    "META-INF/container.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`
  );
  zip.file(
    "OEBPS/text/ch.xhtml",
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" lang="en"><head><meta charset="utf-8"/><title>Article to Kindle — Test</title></head>
<body>
  <h1>Article to Kindle</h1>
  <p>If you can read this on your Kindle, delivery works and the sender address is approved.</p>
  <p dir="rtl" lang="ar">هذا اختبار للتأكد من وصول المستندات العربية إلى جهاز الكندل بشكل صحيح.</p>
</body></html>`
  );
  zip.file(
    "OEBPS/nav.xhtml",
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="en"><head><meta charset="utf-8"/><title>Contents</title></head>
<body><nav epub:type="toc" id="toc"><ol><li><a href="text/ch.xhtml">Test</a></li></ol></nav></body></html>`
  );
  zip.file(
    "OEBPS/content.opf",
    `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">urn:uuid:${id}</dc:identifier>
    <dc:title>Article to Kindle — Test</dc:title>
    <dc:language>en</dc:language>
    <meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d+Z$/, "Z")}</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="ch" href="text/ch.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine><itemref idref="ch"/></spine>
</package>`
  );
  return await zip.generateAsync({ type: "nodebuffer", mimeType: "application/epub+zip" });
}
