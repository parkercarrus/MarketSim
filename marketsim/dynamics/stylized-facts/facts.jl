using Statistics

function autocorr(x::AbstractVector{<:Real}, lag::Int)
    n = length(x)
    if lag <= 0 || lag >= n
        return NaN
    end
    μ = mean(x)
    x0 = @view x[1:(n-lag)]
    x1 = @view x[(1+lag):n]
    num = sum((x0 .- μ) .* (x1 .- μ))
    den = sum((x .- μ).^2)
    return den <= 0 ? NaN : num / den
end

function abs_return_acf(x::AbstractVector{<:Real}, lags::Vector{Int})
    ax = abs.(x)
    return Dict(l => autocorr(ax, l) for l in lags)
end

function leverage_effect(x::AbstractVector{<:Real}, lag::Int=1)
    n = length(x)
    if n <= lag
        return NaN
    end
    r = x[1:(n-lag)]
    rv = (x[(1+lag):n]).^2
    return cor(r, rv)
end

function tail_ratio(x::AbstractVector{<:Real}; q::Float64=0.95)
    hi = quantile(x, q)
    lo = quantile(x, 1 - q)
    return abs(hi / (lo == 0 ? eps() : lo))
end

function hill_tail_index(x::AbstractVector{<:Real}; k::Int=25)
    z = sort(abs.(x), rev=true)
    if length(z) <= k + 1
        return NaN
    end
    xk1 = z[k+1]
    return k / sum(log.(z[1:k] ./ xk1))
end

function variance_ratio(x::AbstractVector{<:Real}, q::Int)
    n = length(x)
    if n <= q + 1
        return NaN
    end
    r1 = var(x; corrected=false)
    rq = [sum(@view x[i:(i+q-1)]) for i in 1:(n-q+1)]
    rqv = var(rq; corrected=false)
    return rqv / (q * r1)
end

function stylized_facts(x::AbstractVector{<:Real})
    lags = [1, 2, 5, 10, 20]
    return Dict(
        :return_acf => Dict(l => autocorr(x, l) for l in lags),
        :abs_return_acf => abs_return_acf(x, lags),
        :leverage => leverage_effect(x, 1),
        :tail_ratio_95 => tail_ratio(x, q=0.95),
        :hill_tail_index => hill_tail_index(x, k=min(25, max(5, Int(length(x) ÷ 10)))),
        :variance_ratio_5 => variance_ratio(x, 5),
        :variance_ratio_10 => variance_ratio(x, 10),
    )
end
