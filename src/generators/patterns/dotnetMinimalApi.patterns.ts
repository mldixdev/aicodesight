import { createPatternModule } from './createPatternModule';

export const dotnetMinimalApiPattern = createPatternModule({
  id: 'dotnet-minimal-api',
  name: '.NET Minimal APIs + EF Core (Vertical Slices)',

  activationCheck: (stack) =>
    (stack.backend?.primary.toLowerCase().includes('.net') ||
     stack.backend?.libraries.some(l => l.name.toLowerCase().includes('entityframework') || l.name.toLowerCase().includes('ef core'))) ?? false,

  folderSuggestions: [
    {
      path: 'Backend/Features/{Feature}',
      purpose: 'Vertical slice: EVERYTHING for a domain together (endpoint, service, entity, DTOs, EF config)',
      suggestedFiles: [
        '{Feature}Endpoints.cs',
        '{Feature}Service.cs',
        'I{Feature}Service.cs',
        '{Feature}.cs',
        '{Feature}Dto.cs',
        '{Feature}Configuration.cs',
        '{Feature}Validator.cs',
      ],
    },
    {
      path: 'Backend/Shared/Database',
      purpose: 'AppDbContext and shared EF Core extensions',
      suggestedFiles: ['AppDbContext.cs'],
    },
    {
      path: 'Backend/Shared/Http',
      purpose: 'Response wrappers, pagination, error handling',
      suggestedFiles: ['PagedResult.cs', 'ErrorResponse.cs'],
    },
    {
      path: 'Backend/Shared/Auth',
      purpose: 'JWT, authentication middleware, claims',
      suggestedFiles: ['AuthMiddleware.cs', 'TokenService.cs'],
    },
  ],

  codePatterns: [
    {
      name: 'Vertical Slice: Complete Feature',
      context: 'Each domain is a self-contained folder. The AI finds EVERYTHING about a domain with a single grep in Features/{Feature}/',
      stackRequirement: ['.NET Minimal APIs', 'EF Core'],
      example: `// Backend/Features/Users/UserEndpoints.cs
public static class UserEndpoints
{
    public static void MapUserEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/users").RequireAuthorization();

        group.MapGet("/", GetAll);
        group.MapGet("/{id:int}", GetById);
        group.MapPost("/", Create);
        group.MapPut("/{id:int}", Update);
        group.MapDelete("/{id:int}", Delete);
    }

    private static async Task<IResult> GetAll(
        [AsParameters] UserFilters filters,
        IUserService service, CancellationToken ct)
    {
        var result = await service.GetAllAsync(filters, ct);
        return Results.Ok(result);
    }
}

// Backend/Features/Users/IUserService.cs
public interface IUserService
{
    Task<PagedResult<UserDto>> GetAllAsync(UserFilters filters, CancellationToken ct);
    Task<UserDto?> GetByIdAsync(int id, CancellationToken ct);
    Task<UserDto> CreateAsync(CreateUserDto dto, CancellationToken ct);
}

// Backend/Features/Users/UserService.cs
public class UserService : IUserService
{
    private readonly AppDbContext _db;
    private readonly IMapper _mapper;
    public UserService(AppDbContext db, IMapper mapper)
    {
        _db = db;
        _mapper = mapper;
    }
}

// Backend/Features/Users/User.cs (entity)
public class User
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
}

// Backend/Features/Users/UserDto.cs
public record UserDto(int Id, string Name);
public record CreateUserDto(string Name);

// Backend/Features/Users/UserConfiguration.cs
public class UserConfiguration : IEntityTypeConfiguration<User>
{
    public void Configure(EntityTypeBuilder<User> builder)
    {
        builder.ToTable("Users");
        builder.HasKey(x => x.Id);
    }
}`,
      antiPattern: 'DO NOT separate by technical layers (Endpoints/, Entities/, Services/). Everything for a domain goes together in Features/{Domain}/. The AI loses context between compactions — if code is scattered across 6 folders, it is more likely to duplicate something it "didn\'t see".',
    },
    {
      name: 'Catalogs: Generic Parameterized Service',
      context: 'Catalog entities (few rows, simple CRUD) share the same logic. A single generic service avoids creating N identical services.',
      stackRequirement: ['.NET Minimal APIs', 'EF Core'],
      example: `// Backend/Features/Catalogs/CatalogEndpoints.cs
public static class CatalogEndpoints
{
    public static void MapCatalogEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/catalogs").RequireAuthorization();

        group.MapGet("/{type}", GetAll);
        group.MapGet("/{type}/{id:int}", GetById);
        group.MapPost("/{type}", Create);
        group.MapPut("/{type}/{id:int}", Update);
    }

    // A single generic method parameterized by catalog type
    private static async Task<IResult> GetAll(
        string type, ICatalogService service, CancellationToken ct)
    {
        var result = await service.GetAllAsync(type, ct);
        return Results.Ok(result);
    }
}

// Backend/Features/Catalogs/ICatalogService.cs
// Generic service — DO NOT create one per catalog table
public interface ICatalogService
{
    Task<List<CatalogItemDto>> GetAllAsync(string type, CancellationToken ct);
    Task<CatalogItemDto> CreateAsync(string type, CreateCatalogDto dto, CancellationToken ct);
}`,
      antiPattern: 'DO NOT create a Feature/ per catalog table (CategoryEndpoints.cs, SourceEndpoints.cs, etc.). Catalogs are identical CRUD — a single generic parameterized service.',
    },
    {
      name: 'Shared: only what 2+ features use',
      context: 'Shared/ contains ONLY code used by 2 or more features. Never move something to Shared/ preemptively.',
      stackRequirement: ['.NET'],
      example: `// Backend/Shared/Http/PagedResult.cs
// Used by ALL features with paginated lists
public class PagedResult<T>
{
    public List<T> Items { get; set; } = new();
    public int TotalCount { get; set; }
    public int Page { get; set; }
    public int PageSize { get; set; }
}

// Backend/Shared/Database/AppDbContext.cs
// Used by ALL features — the only file that knows all entities
public class AppDbContext : DbContext
{
    // DbSets are registered here, configurations are loaded from each Feature/
    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        // Automatic loading of IEntityTypeConfiguration from the assembly
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(AppDbContext).Assembly);
    }
}`,
      antiPattern: 'DO NOT create Shared/ preemptively. Only move code when it is confirmed that 2+ features need it. A service used by only one feature goes INSIDE that feature.',
    },
  ],

  dataFlows: [
    {
      name: 'Backend Read Flow',
      layers: ['Minimal API Endpoint', 'Service (logic)', 'DbContext (EF Core)', 'SQL Server'],
      description: 'Request reaches the endpoint → delegates to service (same directory) → service uses DbContext with LINQ → EF translates to SQL → returns mapped DTO. All involved code is in Features/{Domain}/.',
    },
    {
      name: 'Backend Write Flow',
      layers: ['Minimal API Endpoint', 'Validation', 'Service', 'AutoMapper', 'DbContext.SaveChanges', 'SQL Server'],
      description: 'Request with DTO → endpoint validates → service maps DTO→Entity → persists → returns response DTO. Validator, service, DTOs and entity: all in Features/{Domain}/.',
    },
  ],

  sharedUtilities: [
    {
      name: 'AppDbContext',
      purpose: 'EF Core DbContext — the only point that knows all entities',
      suggestedPath: 'Backend/Shared/Database/AppDbContext.cs',
      stackReason: 'EF Core requires a centralized DbContext. ApplyConfigurationsFromAssembly() loads configs from each Feature/.',
    },
    {
      name: 'PagedResult<T>',
      purpose: 'Generic pagination wrapper (items, totalCount, page, pageSize)',
      suggestedPath: 'Backend/Shared/Http/PagedResult.cs',
      stackReason: 'All features with paginated lists use the same response format.',
    },
  ],

  antiDuplicationEntries: [
    { need: 'CRUD for any catalog', solution: 'CatalogEndpoints + generic ICatalogService', canonicalPath: 'Features/Catalogs/' },
    { need: 'Endpoint + service for a domain', solution: 'Vertical slice in Features/{Domain}/', canonicalPath: 'Features/{Domain}/' },
    { need: 'Paginated response', solution: 'Generic PagedResult<T>', canonicalPath: 'Shared/Http/PagedResult.cs' },
    { need: 'EF entity configuration', solution: 'IEntityTypeConfiguration inside the Feature', canonicalPath: 'Features/{Domain}/{Entity}Configuration.cs' },
    { need: 'Shared DbContext', solution: 'AppDbContext with ApplyConfigurationsFromAssembly', canonicalPath: 'Shared/Database/AppDbContext.cs' },
  ],

  antiPatterns: [
    { pattern: 'Structure by technical layers (Endpoints/, Services/, Entities/)', reason: 'The AI searches in Features/{Domain}/ and finds EVERYTHING. With layers, it must search 6 different folders — loses context and duplicates', alternative: 'Vertical slices: Features/{Domain}/ contains endpoint, service, entity, DTOs, config' },
    { pattern: 'One endpoint/service per catalog table', reason: 'Multiplies files with identical CRUD logic', alternative: 'CatalogEndpoints + generic parameterized ICatalogService' },
    { pattern: 'DTOs in a separate DTOs/ folder', reason: 'Decouples DTOs from the feature that uses them — the AI cannot discover them', alternative: 'DTOs inside Features/{Domain}/ alongside the service that uses them' },
    { pattern: 'Moving to Shared/ preemptively', reason: 'Creates premature abstractions that nobody else uses', alternative: 'Only move to Shared/ when 2+ features confirm the need' },
    { pattern: 'Data Annotations on entities', reason: 'Mixes persistence concerns with the domain model', alternative: 'IEntityTypeConfiguration in a separate file inside the Feature' },
    { pattern: 'Business logic in endpoints', reason: 'Endpoints should be thin wrappers that delegate to the service', alternative: 'Inject IService and delegate. Service lives in the same Feature/' },
  ],
});
