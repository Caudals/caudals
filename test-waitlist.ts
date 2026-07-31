import { Pool } from "pg";
import { config } from "dotenv";
config({ path: ".env.local" });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
async function test() {
  try {
    await pool.query("INSERT INTO waitlist_signup (id, email, full_name, company, use_case) VALUES ('wl_00000000000000000000000000', 'test@example.com', 'test', 'test', 'test')");
    console.log("Success");
  } catch (err) {
    console.error("DB Error:", err);
  } finally {
    pool.end();
  }
}
test();
