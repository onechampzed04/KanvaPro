import dotenv from 'dotenv';
dotenv.config();
import { Client } from 'pg';
const client = new Client({ connectionString: process.env.DATABASE_URL });
client.connect().then(async () => {
    const res = await client.query("SELECT de.properties->>'src' as src FROM design_elements de WHERE de.properties->>'src' LIKE '%pptx_%' LIMIT 5");
    console.log("PPTX images raw:", res.rows);
    const res2 = await client.query("SELECT de.properties->>'src' as src FROM design_elements de WHERE de.properties->>'src' NOT LIKE '%/uploads/images/pptx_%' AND de.properties->>'src' LIKE '%pptx_%' LIMIT 5");
    console.log("PPTX images escaping my filter:", res2.rows);
    client.end();
});
