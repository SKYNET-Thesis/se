using FluentValidation;
using MediatR;
using OmniArm.Application.Common.Behaviours;
using ValidationException = OmniArm.Application.Common.Exceptions.ValidationException;

namespace OmniArm.Application.Tests.Common.Behaviours;

public class ValidationBehaviourTests
{
    private sealed record TestRequest(string Name) : IRequest<string>;

    private sealed class AlwaysInvalidValidator : AbstractValidator<TestRequest>
    {
        public AlwaysInvalidValidator()
        {
            RuleFor(x => x.Name).NotEmpty().WithMessage("Name is required");
        }
    }

    [Fact]
    public async Task Handle_NoValidators_CallsNextHandler()
    {
        var behaviour = new ValidationBehaviour<TestRequest, string>(Array.Empty<IValidator<TestRequest>>());
        var nextCalled = false;

        Task<string> Next(CancellationToken ct)
        {
            nextCalled = true;
            return Task.FromResult("ok");
        }

        var result = await behaviour.Handle(new TestRequest("value"), Next, CancellationToken.None);

        Assert.True(nextCalled);
        Assert.Equal("ok", result);
    }

    [Fact]
    public async Task Handle_ValidRequest_CallsNextHandler()
    {
        var behaviour = new ValidationBehaviour<TestRequest, string>(
            new IValidator<TestRequest>[] { new AlwaysInvalidValidator() });
        var nextCalled = false;

        Task<string> Next(CancellationToken ct)
        {
            nextCalled = true;
            return Task.FromResult("ok");
        }

        var result = await behaviour.Handle(new TestRequest("value"), Next, CancellationToken.None);

        Assert.True(nextCalled);
        Assert.Equal("ok", result);
    }

    [Fact]
    public async Task Handle_InvalidRequest_ThrowsValidationException()
    {
        var behaviour = new ValidationBehaviour<TestRequest, string>(
            new IValidator<TestRequest>[] { new AlwaysInvalidValidator() });

        Task<string> Next(CancellationToken ct) => Task.FromResult("ok");

        await Assert.ThrowsAsync<ValidationException>(
            () => behaviour.Handle(new TestRequest(string.Empty), Next, CancellationToken.None));
    }
}
