import AddToWatchlistButton from '@/components/AddToWatchlistButton'
import WatchlistRemoveButton from '@/components/WatchlistRemoveButton'

type Props = {
    symbol: string
    onRemoved?: () => void
}

export default function WatchlistActions({ symbol, onRemoved }: Props) {
    return (
        <div className="flex items-center gap-2">
            <AddToWatchlistButton symbol={symbol} />
            <WatchlistRemoveButton symbol={symbol} onRemoved={onRemoved} />
        </div>
    )
}
