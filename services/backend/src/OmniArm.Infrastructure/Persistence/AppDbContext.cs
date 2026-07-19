using Microsoft.EntityFrameworkCore;
using OmniArm.Application.Common.Interfaces;

namespace OmniArm.Infrastructure.Persistence;

public class AppDbContext : DbContext, IAppDbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options)
    {
    }
}
