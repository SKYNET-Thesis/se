using MediatR;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace OmniArm.Application.Tests;

public class DependencyInjectionTests
{
    [Fact]
    public void AddApplication_ResolvesMediator()
    {
        var services = new ServiceCollection();
        services.AddLogging();

        services.AddApplication();

        using var provider = services.BuildServiceProvider();

        var mediator = provider.GetService<IMediator>();

        Assert.NotNull(mediator);
    }
}
