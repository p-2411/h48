// Makes or brings up to date the tables in DATABASE_URL. Safe to run again.
import { database } from '../src/db.js';
import { migrate } from '../src/schema.js';

await migrate(database());
console.log('Tables are up to date.');
