using Random, Statistics

function skew(x::AbstractVector{<:Real}, n::Int, μ::Float64, σ::Float64)
    @assert n == length(x)
    if σ == 0.0
        return NaN
    end
    σ3 = 0.0
    @inbounds @simd for i in eachindex(x)
        d = Float64(x[i]) - μ
        σ3 += d^3
    end
    return (σ3 / (n * σ^3))
end

function kurtosis(x::AbstractVector{<:Real}, n::Int, μ::Float64, σ::Float64)
    @assert n == length(x)
    if σ == 0.0
        return NaN
    end
    σ4 = 0.0
    @inbounds @simd for i in eachindex(x)
        d = Float64(x[i]) - μ
        σ4 += d^4
    end
    return (σ4 / (n * σ^4)) - 3.0
end

function stats(x::AbstractVector{<:Real})
    n = length(x)
    μ = mean(x)
    σ = std(x; corrected=false)
    x_skew = skew(x, n, μ, σ)
    x_kurtosis = kurtosis(x, n, μ, σ)
    return Dict(
        :mean => μ,
        :std => σ,
        :skew => x_skew,
        :kurtosis => x_kurtosis
    )
end
