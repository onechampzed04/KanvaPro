import dotenv from 'dotenv';
dotenv.config();
import { Client } from 'pg';
const client = new Client({ connectionString: process.env.DATABASE_URL });
client.connect().then(async () => {
    const res = await client.query("SELECT de.properties->>'src' as src FROM design_elements de WHERE de.properties->>'src' LIKE '%pptx_%' LIMIT 5");
    console.log("PPTX images:", res.rows);
    client.end();
});
