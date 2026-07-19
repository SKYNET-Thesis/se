using System.ComponentModel.DataAnnotations.Schema;

namespace OmniArm.Domain.Common;

public abstract class BaseEntity
{
       public Guid Id { get; set; }
}
