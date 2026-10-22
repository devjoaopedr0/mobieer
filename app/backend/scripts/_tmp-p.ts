import fs from "node:fs";
import { pdfToJpgs } from "../src/lib/pdf-render";
(async () => {
  const pages = await pdfToJpgs(fs.readFileSync(process.argv[2]), { maxPages: 1 });
  console.log(pages.map((p) => `${p.page} ${p.width}x${p.height} ${Math.round(p.bytes.length / 1024)}KB`));
  fs.writeFileSync(process.argv[3], pages[0].bytes);
})().catch((e) => console.error("ERRO", e));
