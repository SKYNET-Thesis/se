FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

COPY OmniArm.sln .
COPY src/OmniArm.Domain/OmniArm.Domain.csproj src/OmniArm.Domain/
COPY src/OmniArm.Application/OmniArm.Application.csproj src/OmniArm.Application/
COPY src/OmniArm.Infrastructure/OmniArm.Infrastructure.csproj src/OmniArm.Infrastructure/
COPY src/OmniArm.Api/OmniArm.Api.csproj src/OmniArm.Api/
RUN dotnet restore src/OmniArm.Api/OmniArm.Api.csproj

COPY src/ src/
RUN dotnet publish src/OmniArm.Api/OmniArm.Api.csproj -c Release -o /app --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS runtime
WORKDIR /app
COPY --from=build /app .

ENV ASPNETCORE_URLS=http://+:3000
EXPOSE 3000

ENTRYPOINT ["dotnet", "OmniArm.Api.dll"]
