async function bootstrap() {
  console.log("OmniArm backend service starting...");
}

bootstrap().catch((error) => {
  console.error(error);
  process.exit(1);
});
