using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using OmniArm.Infrastructure.Mqtt;
using OmniArm.Infrastructure.Persistence;

namespace OmniArm.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructure(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddDbContext<AppDbContext>(options =>
            options.UseNpgsql(configuration.GetConnectionString("Postgres")));

        services.Configure<MqttOptions>(configuration.GetSection(MqttOptions.SectionName));
        services.AddSingleton<MqttConnectionService>();
        services.AddHostedService(provider => provider.GetRequiredService<MqttConnectionService>());

        return services;
    }
}
