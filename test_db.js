const { Client } = require('pg');
const client = new Client({ connectionString: 'postgres://neondb_owner:npg_vR9K6yQZbxId@ep-solitary-tree-a1v7s4on-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require' });
client.connect().then(async () => {
    const res = await client.query("SELECT de.properties->>'src' as src FROM design_elements de WHERE de.properties->>'src' IS NOT NULL AND de.properties->>'src' != '' LIMIT 10");
    console.log(res.rows);
    const res2 = await client.query("SELECT de.properties->>'src' as src FROM design_elements de WHERE de.properties->>'src' LIKE '%pptx_%' LIMIT 10");
    console.log("PPTX:", res2.rows);
    client.end();
});
