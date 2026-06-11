import dotenv from 'dotenv';
dotenv.config();
import { db } from './config/database.js';
import fs from 'fs';
import path from 'path';
(async () => {
    try {
        const res = await db.query("SELECT id, properties->>'src' as src FROM design_elements WHERE properties->>'src' LIKE '%pptx_%'", []);
        let count = 0;
        for(const row of res.rows) {
            if(!row.src) continue;
            let relativePath = row.src;
            if(relativePath.startsWith('http')) {
                relativePath = new URL(relativePath).pathname;
            }
            const fullPath = path.join(process.cwd(), 'public', relativePath);
            if (!fs.existsSync(fullPath)) {
                await db.execute('DELETE FROM design_elements WHERE id = ', [row.id]);
                count++;
            }
        }
        console.log('Deleted', count, 'broken pptx elements from db');
    } catch(e) {
        console.error(e);
    }
    process.exit(0);
})();
