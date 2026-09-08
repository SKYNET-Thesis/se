namespace OmniArm.Infrastructure.Mqtt;

public class MqttOptions
{
    public const string SectionName = "Mqtt";

    public string Host { get; set; } = "localhost";

    public int Port { get; set; } = 1883;
}
