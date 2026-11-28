// Reproduce the document registered for each fictional rental with the production renderer and RPC.
import { mkdir, writeFile } from "node:fs/promises";
import { rentalDatabase } from "../rentals/database";
import { seedTerm } from "./term-fixture";
const dir = "docs/vistoria-evidencias/termos";
await mkdir(dir, { recursive: true });
for (const brand of ["cordial", "morar"] as const) {
  const db = await rentalDatabase();
  try {
    const fixture = await seedTerm(db, brand);
    const { version } = await fixture.emit(await fixture.snapshot());
    const stored = await fixture.download(version);
    await writeFile(`${dir}/${brand}.pdf`, stored.bytes);
    console.log(brand, version, stored.sha);
  } finally {
    await db.close();
  }
}
