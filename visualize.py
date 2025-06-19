import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns

df = pd.read_csv('market_history.csv')

pnl = pd.read_csv('avg_pnl.csv')

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

# histogram of avg_pnl by trader
plt.figure(figsize=(8, 4))
plt.bar(pnl.iloc[:, 0], pnl.iloc[:, 1], color='skyblue', edgecolor='black')
plt.xlabel('Trader Type')
plt.ylabel('Average PnL')
plt.title('Average PnL by Trader Type')
plt.tight_layout()
plt.show()