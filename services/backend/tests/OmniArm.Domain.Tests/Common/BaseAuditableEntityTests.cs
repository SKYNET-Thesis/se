using OmniArm.Domain.Common;

namespace OmniArm.Domain.Tests.Common;

public class BaseAuditableEntityTests
{
    private sealed class TestAuditableEntity : BaseAuditableEntity
    {
    }

    [Fact]
    public void NewEntity_HasNullLastModifiedValues()
    {
        var entity = new TestAuditableEntity();

        Assert.Null(entity.LastModifiedAt);
        Assert.Null(entity.LastModifiedBy);
    }
}
