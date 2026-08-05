using OmniArm.Domain.Common;

namespace OmniArm.Domain.Tests.Common;

public class BaseEntityTests
{
    private sealed class TestEntity : BaseEntity
    {
    }

    [Fact]
    public void Id_StoresGuidValue()
    {
        var id = Guid.NewGuid();
        var entity = new TestEntity { Id = id };

        Assert.Equal(id, entity.Id);
    }
}
