using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using MQTTnet;

namespace OmniArm.Infrastructure.Mqtt;

public class MqttConnectionService : IHostedService, IAsyncDisposable
{
    private readonly IMqttClient _client;
    private readonly MqttOptions _options;
    private readonly ILogger<MqttConnectionService> _logger;

    public MqttConnectionService(IOptions<MqttOptions> options, ILogger<MqttConnectionService> logger)
    {
        _options = options.Value;
        _logger = logger;
        _client = new MqttClientFactory().CreateMqttClient();
    }

    public bool IsConnected => _client.IsConnected;

    public async Task StartAsync(CancellationToken cancellationToken)
    {
        var clientOptions = new MqttClientOptionsBuilder()
            .WithTcpServer(_options.Host, _options.Port)
            .Build();

        try
        {
            await _client.ConnectAsync(clientOptions, cancellationToken);
            _logger.LogInformation("Connected to MQTT broker at {Host}:{Port}", _options.Host, _options.Port);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Could not connect to MQTT broker at {Host}:{Port}", _options.Host, _options.Port);
        }
    }

    public async Task StopAsync(CancellationToken cancellationToken)
    {
        if (_client.IsConnected)
        {
            await _client.DisconnectAsync(cancellationToken: cancellationToken);
        }
    }

    public async ValueTask DisposeAsync()
    {
        _client.Dispose();
        await Task.CompletedTask;
    }
}
