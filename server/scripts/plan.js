// Sets a user's plan by hand, until payments do it: npm run plan -- <email or WorkOS user id> <free|paid>
import { database } from '../src/db.js';
import { setPlan } from '../src/users.js';

const [key, plan] = process.argv.slice(2);
if (!key || !plan) {
  console.error('Use: npm run plan -- <email or user id> <free|paid>');
  process.exit(1);
}
const user = await setPlan(database(), key, plan);
if (!user) {
  console.error(`No user ${key}. They must open Duet signed in once first.`);
  process.exit(1);
}
console.log(`${user.email ?? user.id} is now ${user.plan}.`);
