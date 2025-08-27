include("stylized-facts/moments.jl")
include("stylized-facts/arch.jl")
include("stylized-facts/garch.jl")
# Include future packages here


function analyze_state(x::AbstractVector{<:Real}, GARCH_q::Int)
    moment_stats = stats(x)
    arch = fit_arch_q(x, GARCH_q)
    garch = fit_garch_q(x, GARCH_q)
    
    return Dict("moment_stats": moment_stats, "arch": arch, "garch": garch)
end