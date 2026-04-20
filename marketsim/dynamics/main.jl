include("stylized-facts/moments.jl")
include("stylized-facts/arch.jl")
include("stylized-facts/garch.jl")
include("stylized-facts/facts.jl")

function analyze_state(x::AbstractVector{<:Real}, GARCH_q::Int)
    moment_stats = stats(x)
    arch = fit_arch_q(x, GARCH_q)
    garch = fit_garch_q(x, GARCH_q)
    facts = stylized_facts(x)

    return Dict(
        "moment_stats" => moment_stats,
        "stylized_facts" => facts,
        "arch" => arch,
        "garch" => garch,
    )
end
