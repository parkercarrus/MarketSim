import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns

df = pd.read_csv('../results/market_history.csv')

pnl = pd.read_csv('../results/avg_pnl.csv')

# price over Time
plt.figure(figsize=(10, 4))
plt.plot(df['timestep'], df['price'], label='Price')
plt.xlabel('Time')
plt.ylabel('Price')
plt.title(f'{len(df)} total trades')
plt.legend()
plt.tight_layout()

# crosstab of trade counts between buyer and seller types
pair_counts = pd.crosstab(df['buyer_type'], df['seller_type'])

# heatmap of trade type counts
plt.figure(figsize=(6, 5))
sns.heatmap(pair_counts, annot=True, fmt='d', cmap='YlGnBu', cbar=True)
plt.title('Trade Counts by Buyer/Seller Type')
plt.xlabel('Seller Type')
plt.ylabel('Buyer Type')
plt.tight_layout()

trader_types = pnl.iloc[:, 0]
avg_pnls = pnl.iloc[:, 1] - 1000 # adjust for starting capital

max_abs_pnl = max(abs(avg_pnls.min()), abs(avg_pnls.max()))
margin = 50 

plt.figure(figsize=(8, 4))
colors = ['#39FF14' if val >= 0 else 'red' for val in avg_pnls]
bars = plt.bar(trader_types, avg_pnls, color=colors, edgecolor='black')

for bar in bars:
    yval = bar.get_height()
    offset = 10 if yval >= 0 else -15
    va = 'bottom' if yval >= 0 else 'top'
    plt.text(bar.get_x() + bar.get_width() / 2, yval + offset, f'{yval:.0f}', 
             ha='center', va=va, fontsize=9)

plt.ylim(-max_abs_pnl - margin, max_abs_pnl + margin)

plt.axhline(0, color='black', linewidth=1)
plt.xlabel('Trader Type')
plt.ylabel('Average PnL')
plt.title('Average PnL by Trader Type')
plt.tight_layout()
plt.show()