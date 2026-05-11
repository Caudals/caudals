import { seedOperatorConsoleFixtures } from "./operator-console-fixtures";

seedOperatorConsoleFixtures().catch((error) => {
  console.error(error);
  process.exit(1);
});
