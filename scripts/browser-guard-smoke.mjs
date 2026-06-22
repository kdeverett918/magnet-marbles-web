import {
  BROWSER_AUTOMATION_ALIASES,
  BROWSER_AUTOMATION_ENV,
  browserLaunchAllowed,
  browserLaunchOptInMessage,
} from "./lib/cdp-browser.mjs";

const report = {
  pass: false,
  capturedAt: new Date().toISOString(),
  browserAutomation: false,
  checkedEnv: [BROWSER_AUTOMATION_ENV, ...BROWSER_AUTOMATION_ALIASES],
};

try {
  const emptyEnvAllowed = browserLaunchAllowed({});
  const explicitEnvAllowed = browserLaunchAllowed({ [BROWSER_AUTOMATION_ENV]: "1" });
  const aliasEnvAllowed = browserLaunchAllowed({ [BROWSER_AUTOMATION_ALIASES[0]]: "1" });
  const message = browserLaunchOptInMessage();

  report.pass = !emptyEnvAllowed
    && explicitEnvAllowed
    && aliasEnvAllowed
    && message.includes(BROWSER_AUTOMATION_ENV);
  report.evidence = {
    emptyEnvAllowed,
    explicitEnvAllowed,
    aliasEnvAllowed,
    message,
  };

  console.log(JSON.stringify(report, null, 2));
  if (!report.pass) process.exit(1);
} catch (error) {
  report.error = error instanceof Error ? error.message : String(error);
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}
