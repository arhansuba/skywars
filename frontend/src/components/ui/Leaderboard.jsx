import React, { useState } from 'react';
import PropTypes from 'prop-types';
import Card from './Card';

/**
 * Leaderboard component to display player rankings.
 */
const Leaderboard = ({
  data = [],
  title = 'Leaderboard',
  columns = [
    { id: 'rank', label: '#', width: '10%' },
    { id: 'player', label: 'Player', width: '40%' },
    { id: 'score', label: 'Score', width: '25%' },
    { id: 'kd', label: 'K/D', width: '25%' }
  ],
  currentUserId = null,
  maxItems = 10,
  loading = false,
  error = null,
  onRowClick,
  showViewAll = false,
  onViewAll,
  sortBy = 'score',
  sortDirection = 'desc',
  onSortChange,
}) => {
  const [expandedRows, setExpandedRows] = useState(new Set());
  
  // Handle row expansion toggle
  const toggleRowExpansion = (id) => {
    const newExpandedRows = new Set(expandedRows);
    if (expandedRows.has(id)) {
      newExpandedRows.delete(id);
    } else {
      newExpandedRows.add(id);
    }
    setExpandedRows(newExpandedRows);
  };
  
  // Handle column sort
  const handleSort = (columnId) => {
    if (onSortChange) {
      const newDirection = sortBy === columnId && sortDirection === 'desc' ? 'asc' : 'desc';
      onSortChange(columnId, newDirection);
    }
  };
  
  // Loading state
  if (loading) {
    return (
      <Card title={title}>
        <div className="flex justify-center items-center p-6">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-sky-500"></div>
        </div>
      </Card>
    );
  }
  
  // Error state
  if (error) {
    return (
      <Card title={title}>
        <div className="text-red-500 p-4 text-center">
          {error}
        </div>
      </Card>
    );
  }
  
  // Empty state
  if (!data.length) {
    return (
      <Card title={title}>
        <div className="text-slate-400 p-6 text-center">
          No leaderboard data available yet.
        </div>
      </Card>
    );
  }

  return (
    <Card title={title}>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-700">
              {columns.map((column) => (
                <th 
                  key={column.id}
                  className={`px-3 py-2 text-left text-sm font-medium text-slate-300 ${
                    onSortChange ? 'cursor-pointer hover:text-white' : ''
                  }`}
                  style={{ width: column.width }}
                  onClick={() => onSortChange && handleSort(column.id)}
                >
                  <div className="flex items-center space-x-1">
                    <span>{column.label}</span>
                    {sortBy === column.id && (
                      <span className="text-sky-500">
                        {sortDirection === 'desc' ? '▼' : '▲'}
                      </span>
                    )}
                  </div>
                </th>
              ))}
              <th className="w-8"></th>
            </tr>
          </thead>
          <tbody>
            {data.slice(0, maxItems).map((item, index) => {
              const isCurrentUser = currentUserId && item.id === currentUserId;
              const isExpanded = expandedRows.has(item.id);
              
              return (
                <React.Fragment key={item.id}>
                  <tr 
                    className={`border-b border-slate-800 ${
                      isCurrentUser ? 'bg-sky-900/20' : index % 2 === 0 ? 'bg-slate-800/20' : ''
                    } hover:bg-slate-700/30 transition-colors ${
                      onRowClick ? 'cursor-pointer' : ''
                    }`}
                    onClick={() => onRowClick && onRowClick(item)}
                  >
                    {columns.map((column) => (
                      <td 
                        key={column.id} 
                        className={`px-3 py-2 text-sm ${
                          isCurrentUser ? 'text-sky-400' : 'text-white'
                        } ${column.className || ''}`}
                      >
                        {column.id === 'rank' ? (
                          <div className="flex items-center justify-center w-6 h-6 rounded-full bg-slate-700">
                            {index + 1}
                          </div>
                        ) : column.id === 'player' ? (
                          <div className="flex items-center space-x-2">
                            {item.avatar && (
                              <img 
                                src={item.avatar} 
                                alt={item.name} 
                                className="w-6 h-6 rounded-full"
                              />
                            )}
                            <span className="font-medium">
                              {item.name}
                              {item.squadron && (
                                <span className="ml-1 text-xs px-1 py-0.5 bg-slate-700 rounded">
                                  {item.squadron}
                                </span>
                              )}
                            </span>
                            {isCurrentUser && (
                              <span className="text-xs text-sky-400">(You)</span>
                            )}
                          </div>
                        ) : (
                          <div className="text-right">
                            {item[column.id]}
                          </div>
                        )}
                      </td>
                    ))}
                    <td className="px-1 w-8">
                      {item.details && (
                        <button 
                          className="p-1 rounded hover:bg-slate-700 transition-colors"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleRowExpansion(item.id);
                          }}
                        >
                          <svg 
                            className={`w-4 h-4 text-slate-400 transition-transform ${isExpanded ? 'transform rotate-180' : ''}`} 
                            fill="none" 
                            viewBox="0 0 24 24" 
                            stroke="currentColor"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                      )}
                    </td>
                  </tr>
                  
                  {/* Expanded details row */}
                  {item.details && isExpanded && (
                    <tr className="bg-slate-800/40">
                      <td colSpan={columns.length + 1} className="px-3 py-2">
                        <div className="grid grid-cols-3 gap-4 text-sm text-slate-300">
                          {Object.entries(item.details).map(([key, value]) => (
                            <div key={key} className="flex flex-col">
                              <span className="text-xs text-slate-400">{key}</span>
                              <span>{value}</span>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      
      {showViewAll && data.length > maxItems && (
        <div className="mt-3 text-center">
          <button 
            className="text-sm text-sky-400 hover:text-sky-300 transition-colors"
            onClick={onViewAll}
          >
            View All Rankings
          </button>
        </div>
      )}
    </Card>
  );
};

Leaderboard.propTypes = {
  data: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
      name: PropTypes.string.isRequired,
      avatar: PropTypes.string,
      squadron: PropTypes.string,
      details: PropTypes.object,
    })
  ),
  title: PropTypes.string,
  columns: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      label: PropTypes.string.isRequired,
      width: PropTypes.string,
      className: PropTypes.string,
    })
  ),
  currentUserId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  maxItems: PropTypes.number,
  loading: PropTypes.bool,
  error: PropTypes.string,
  onRowClick: PropTypes.func,
  showViewAll: PropTypes.bool,
  onViewAll: PropTypes.func,
  sortBy: PropTypes.string,
  sortDirection: PropTypes.oneOf(['asc', 'desc']),
  onSortChange: PropTypes.func,
};

export default Leaderboard;