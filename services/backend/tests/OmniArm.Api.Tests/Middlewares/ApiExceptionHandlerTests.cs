using System.Text.Json;
using FluentValidation.Results;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;
using OmniArm.Api.Middlewares;
using ValidationException = OmniArm.Application.Common.Exceptions.ValidationException;

namespace OmniArm.Api.Tests.Middlewares;

public class ApiExceptionHandlerTests
{
    private sealed class TestLogger<T> : ILogger<T>
    {
        public List<(LogLevel Level, string Message)> Entries { get; } = new();

        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;

        public bool IsEnabled(LogLevel logLevel) => true;

        public void Log<TState>(
            LogLevel logLevel,
            EventId eventId,
            TState state,
            Exception? exception,
            Func<TState, Exception?, string> formatter)
        {
            Entries.Add((logLevel, formatter(state, exception)));
        }
    }

    private static DefaultHttpContext CreateHttpContext()
    {
        var context = new DefaultHttpContext();
        context.Response.Body = new MemoryStream();
        return context;
    }

    private static async Task<string> ReadBodyAsStringAsync(HttpContext context)
    {
        context.Response.Body.Seek(0, SeekOrigin.Begin);
        using var reader = new StreamReader(context.Response.Body, leaveOpen: true);
        return await reader.ReadToEndAsync();
    }

    [Fact]
    public async Task TryHandleAsync_ValidationException_Returns400()
    {
        var handler = new ApiExceptionHandler(new TestLogger<ApiExceptionHandler>());
        var context = CreateHttpContext();
        var exception = new ValidationException(new List<ValidationFailure> { new("Name", "Name is required") });

        var handled = await handler.TryHandleAsync(context, exception, CancellationToken.None);

        Assert.True(handled);
        Assert.Equal(StatusCodes.Status400BadRequest, context.Response.StatusCode);
    }

    [Fact]
    public async Task TryHandleAsync_ValidationException_IncludesGroupedFieldErrors()
    {
        var handler = new ApiExceptionHandler(new TestLogger<ApiExceptionHandler>());
        var context = CreateHttpContext();
        var failures = new List<ValidationFailure>
        {
            new("Name", "Name is required"),
            new("Name", "Name is too long"),
            new("Age", "Age must be positive"),
        };
        var exception = new ValidationException(failures);

        await handler.TryHandleAsync(context, exception, CancellationToken.None);

        context.Response.Body.Seek(0, SeekOrigin.Begin);
        var problem = await JsonSerializer.DeserializeAsync<ValidationProblemDetails>(context.Response.Body);

        Assert.NotNull(problem);
        Assert.Equal(2, problem!.Errors["Name"].Length);
        Assert.Single(problem.Errors["Age"]);
    }

    [Fact]
    public async Task TryHandleAsync_UnexpectedException_Returns500()
    {
        var handler = new ApiExceptionHandler(new TestLogger<ApiExceptionHandler>());
        var context = CreateHttpContext();

        var handled = await handler.TryHandleAsync(context, new InvalidOperationException("db is down"), CancellationToken.None);

        Assert.True(handled);
        Assert.Equal(StatusCodes.Status500InternalServerError, context.Response.StatusCode);
    }

    [Fact]
    public async Task TryHandleAsync_UnexpectedException_DoesNotExposeInternalDetails()
    {
        var handler = new ApiExceptionHandler(new TestLogger<ApiExceptionHandler>());
        var context = CreateHttpContext();

        await handler.TryHandleAsync(context, new InvalidOperationException("db connection string leaked"), CancellationToken.None);

        var body = await ReadBodyAsStringAsync(context);

        Assert.DoesNotContain("db connection string leaked", body);
        Assert.DoesNotContain("InvalidOperationException", body);
        Assert.DoesNotContain("StackTrace", body, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("System.", body);
    }

    [Fact]
    public async Task TryHandleAsync_ValidationException_DoesNotLogAsUnexpectedError()
    {
        var logger = new TestLogger<ApiExceptionHandler>();
        var handler = new ApiExceptionHandler(logger);
        var context = CreateHttpContext();
        var exception = new ValidationException(new List<ValidationFailure> { new("Name", "Name is required") });

        await handler.TryHandleAsync(context, exception, CancellationToken.None);

        Assert.Empty(logger.Entries);
    }

    [Fact]
    public async Task TryHandleAsync_UnexpectedException_LoggedExactlyOnce()
    {
        var logger = new TestLogger<ApiExceptionHandler>();
        var handler = new ApiExceptionHandler(logger);
        var context = CreateHttpContext();

        await handler.TryHandleAsync(context, new InvalidOperationException("boom"), CancellationToken.None);

        Assert.Single(logger.Entries);
        Assert.Equal(LogLevel.Error, logger.Entries[0].Level);
    }
}
