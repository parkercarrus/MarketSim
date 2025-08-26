include("stylized-facts/moments.jl")
# Include future packages here


function analyze_state(x::AbstractVector{<:Real})
    return stats(x)
end