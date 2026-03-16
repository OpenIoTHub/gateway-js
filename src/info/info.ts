export let Version = '';
export let Commit = '';
export let BuildDate = '';
export let BuiltBy = '';

export function buildVersion(
  version: string,
  commit: string,
  date: string,
  builtBy: string,
): string {
  const coalesce = (input: string, fallback: string) => (input || fallback);
  let result = coalesce(version, Version);
  result = `${result}\ncommit: ${coalesce(commit, Commit)}`;
  result = `${result}\nbuilt at: ${coalesce(date, BuildDate)}`;
  result = `${result}\nbuilt by: ${coalesce(builtBy, BuiltBy)}`;
  return result;
}

export function printLogo(): void {
  console.log('                                                                             ');
  console.log(" ,-----.                       ,--.      ,--------.,--.  ,--.        ,--.    ");
  console.log("'  .-.  ' ,---.  ,---. ,--,--, |  | ,---.'--.  .--'|  '--'  |,--.,--.|  |-.  ");
  console.log("|  | |  || .-. || .-. :|      \\|  || .-. |  |  |   |  .--.  ||  ||  || .-. ' ");
  console.log("'  '-'  '| '-' '\\   --.|  ||  ||  |' '-' '  |  |   |  |  |  |'  ''  '| `-' | ");
  console.log(" `-----' |  |-'  `----'`--''--'`--' `---'   `--'   `--'  `--' `----'  `---'   ");
  console.log("         `--'               form https://github.com/OpenIoTHub/gateway-js     ");
}
