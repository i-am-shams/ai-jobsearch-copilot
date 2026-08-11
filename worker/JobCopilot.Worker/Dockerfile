FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

COPY api/JobCopilot.Contracts/JobCopilot.Contracts.csproj api/JobCopilot.Contracts/
COPY worker/JobCopilot.Worker/JobCopilot.Worker.csproj worker/JobCopilot.Worker/
RUN dotnet restore worker/JobCopilot.Worker/JobCopilot.Worker.csproj

COPY api/JobCopilot.Contracts/ api/JobCopilot.Contracts/
COPY worker/JobCopilot.Worker/ worker/JobCopilot.Worker/
RUN dotnet publish worker/JobCopilot.Worker/JobCopilot.Worker.csproj -c Release -o /app/publish --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS runtime
WORKDIR /app
COPY --from=build /app/publish .

ENTRYPOINT ["dotnet", "JobCopilot.Worker.dll"]
