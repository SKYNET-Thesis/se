using FluentValidation.Results;
using ValidationException = OmniArm.Application.Common.Exceptions.ValidationException;

namespace OmniArm.Application.Tests.Common.Exceptions;

public class ValidationExceptionTests
{
    [Fact]
    public void Constructor_GroupsFailuresByProperty()
    {
        var failures = new List<ValidationFailure>
        {
            new("Name", "Name is required"),
            new("Name", "Name is too long"),
            new("Age", "Age must be positive"),
        };

        var exception = new ValidationException(failures);

        Assert.Equal(2, exception.Errors.Count);
        Assert.Equal(new[] { "Name is required", "Name is too long" }, exception.Errors["Name"]);
        Assert.Equal(new[] { "Age must be positive" }, exception.Errors["Age"]);
    }

    [Fact]
    public void DefaultConstructor_HasEmptyErrors()
    {
        var exception = new ValidationException();

        Assert.Empty(exception.Errors);
    }
}
