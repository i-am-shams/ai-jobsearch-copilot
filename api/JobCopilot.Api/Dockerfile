FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

COPY api/JobCopilot.Contracts/JobCopilot.Contracts.csproj api/JobCopilot.Contracts/
COPY api/JobCopilot.Api/JobCopilot.Api.csproj api/JobCopilot.Api/
RUN dotnet restore api/JobCopilot.Api/JobCopilot.Api.csproj

COPY api/JobCopilot.Contracts/ api/JobCopilot.Contracts/
COPY api/JobCopilot.Api/ api/JobCopilot.Api/
RUN dotnet publish api/JobCopilot.Api/JobCopilot.Api.csproj -c Release -o /app/publish --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS runtime
WORKDIR /app

# curl is NOT present in the aspnet:8.0 runtime image (verified by inspecting
# the image directly, along with wget and nc - only coreutils are there). The
# container healthcheck in docker-compose.yml needs an HTTP client, so install
# the one package, without recommends, and drop the apt lists to keep the layer
# small.
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/publish .

ENV ASPNETCORE_URLS=http://+:8080
EXPOSE 8080

ENTRYPOINT ["dotnet", "JobCopilot.Api.dll"]
