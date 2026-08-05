using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Mvc;
using ValidationException = OmniArm.Application.Common.Exceptions.ValidationException;

namespace OmniArm.Api.Middlewares;

public class ApiExceptionHandler : IExceptionHandler
{
    private readonly ILogger<ApiExceptionHandler> _logger;

    public ApiExceptionHandler(ILogger<ApiExceptionHandler> logger)
    {
        _logger = logger;
    }

    public async ValueTask<bool> TryHandleAsync(
        HttpContext httpContext,
        Exception exception,
        CancellationToken cancellationToken)
    {
        if (exception is ValidationException validationException)
        {
            var problemDetails = new ValidationProblemDetails(validationException.Errors)
            {
                Status = StatusCodes.Status400BadRequest,
                Title = "One or more validation errors occurred.",
            };

            httpContext.Response.StatusCode = problemDetails.Status.Value;
            await httpContext.Response.WriteAsJsonAsync(problemDetails, cancellationToken);
            return true;
        }

        _logger.LogError(exception, "Unhandled exception while processing {Path}", httpContext.Request.Path);

        var unexpectedProblem = new ProblemDetails
        {
            Status = StatusCodes.Status500InternalServerError,
            Title = "An unexpected error occurred.",
        };

        httpContext.Response.StatusCode = unexpectedProblem.Status.Value;
        await httpContext.Response.WriteAsJsonAsync(unexpectedProblem, cancellationToken);
        return true;
    }
}
