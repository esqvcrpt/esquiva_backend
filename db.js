import pkg from "pg";
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.postgresql://esquiva:XkMLAa9XpLvHAvY3pJdb1nZ2dqt7FUQW@dpg-d5hda16r433s73bmlh5g-a/esquiva,
  ssl: { rejectUnauthorized: false },
});

export default pool;