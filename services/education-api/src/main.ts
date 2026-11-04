import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { ApiExceptionFilter } from "./common/filters/api-exception.filter";
import { AppModule } from "./app.module";
import { json, urlencoded } from "express";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  const bodyLimit = Number(process.env.HTTP_BODY_LIMIT_BYTES ?? 1048576);
  app.use(json({ limit: bodyLimit }));
  app.use(urlencoded({ extended: true, limit: bodyLimit }));
  app.enableShutdownHooks();

  if (process.env.TRUST_PROXY) app.getHttpAdapter().getInstance().set("trust proxy", Number(process.env.TRUST_PROXY));

  app.setGlobalPrefix("api/v1");
  app.enableCors({
    origin: process.env.WEB_ORIGIN?.split(",").map((origin) => origin.trim()) ?? false,
    credentials: true,
  });
  app.useGlobalFilters(new ApiExceptionFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      forbidUnknownValues: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  if (process.env.NODE_ENV !== "production") {
    const config = new DocumentBuilder()
      .setTitle("VISTA Business API")
      .setDescription("Business API for the VISTA learning platform")
      .setVersion("1.0")
      .build();

    SwaggerModule.setup("docs", app, SwaggerModule.createDocument(app, config));
  }

  await app.listen(Number(process.env.PORT ?? 3000), "0.0.0.0");
}

void bootstrap();
