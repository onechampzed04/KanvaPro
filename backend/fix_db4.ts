import dotenv from 'dotenv';
dotenv.config();
import { Client } from 'pg';
import fs from 'fs';
import path from 'path';
const client = new Client({ connectionString: process.env.DATABASE_URL });
client.connect().then(async () => {
    try {
        const res = await client.query("SELECT id, properties->>'src' as src FROM design_elements WHERE properties->>'src' LIKE '%pptx_%'");
        let count = 0;
        for(const row of res.rows) {
            if(!row.src) continue;
            let relativePath = row.src;
            if(relativePath.startsWith('http')) {
                relativePath = new URL(relativePath).pathname;
            }
            const fullPath = path.join(process.cwd(), 'public', relativePath);
            if (!fs.existsSync(fullPath)) {
                await client.query("DELETE FROM design_elements WHERE id = $1", [row.id]);
                count++;
            }
        }
        console.log('Deleted', count, 'broken pptx elements from db');
    } catch (e) {
        console.error(e);
    }
    client.end();
});
