using System.Text.Json;
using System.Net.Http.Json;
using JobCopilot.Contracts;

namespace JobCopilot.Worker;

public class GeminiMatchingService
{
    private readonly HttpClient _http;
    private readonly string _apiKey;

    public GeminiMatchingService(HttpClient http, IConfiguration config)
    {
        _http = http;
        _apiKey = config["Gemini:ApiKey"]!;
    }

    public async Task<(int score, string gapAnalysis)> ScoreMatch(string resume, string jd)
    {
        var prompt = $@"Compare this resume against this job description.
Return ONLY valid JSON: {{""score"": <0-100 integer>, ""gapAnalysis"": ""<2-3 sentence gap summary>""}}

RESUME: {resume}

JOB DESCRIPTION: {jd}
";

        var body = new { contents = new[] { new { parts = new[] { new { text = prompt } } } } };
        var res = await _http.PostAsJsonAsync(
            $"https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key={_apiKey}",
            body);
        res.EnsureSuccessStatusCode();

        var json = await res.Content.ReadFromJsonAsync<JsonElement>();
        var text = json.GetProperty("candidates")[0].GetProperty("content")
            .GetProperty("parts")[0].GetProperty("text").GetString()!;

        var cleaned = text.Replace("```json", "").Replace("```", "").Trim();
        var result = JsonSerializer.Deserialize<JsonElement>(cleaned);
        return (result.GetProperty("score").GetInt32(), result.GetProperty("gapAnalysis").GetString()!);
    }
}
