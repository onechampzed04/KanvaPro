import dotenv from 'dotenv';
dotenv.config();
import { Client } from 'pg';
const client = new Client({ connectionString: process.env.DATABASE_URL });
client.connect().then(async () => {
    const res = await client.query("SELECT d.user_id FROM users u JOIN designs d ON u.id = d.user_id WHERE u.email = 'ngocchau1912003@gmail.com' LIMIT 1");
    if(res.rows.length === 0) return console.log('no user');
    const userId = res.rows[0].user_id;
    const res2 = await client.query("SELECT de.properties->>'src' as src FROM design_elements de JOIN design_pages dp ON de.page_id = dp.id JOIN designs d ON dp.design_id = d.id WHERE d.user_id =  AND de.properties->>'src' IS NOT NULL AND de.properties->>'src' != '' LIMIT 10", [userId]);
    console.log("Recent stickers:", res2.rows);
    client.end();
});
