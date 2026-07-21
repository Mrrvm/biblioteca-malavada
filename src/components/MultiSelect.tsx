'use client';

import { useState, useRef, useEffect } from 'react';

interface MultiSelectProps {
  options: string[];
  selected: string[];
  onChange: (selected: string[]) => void;
  placeholder?: string;
  label?: string;
}

function MultiSelect({ options, selected, onChange, placeholder = "Select options...", label }: MultiSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleOption = (option: string) => {
    if (selected.includes(option)) {
      onChange(selected.filter(item => item !== option));
    } else {
      onChange([...selected, option]);
    }
  };

  const removeOption = (option: string) => {
    onChange(selected.filter(item => item !== option));
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {label && (
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {label}
        </label>
      )}
      
      <div className="min-h-10 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white cursor-pointer">
        <div 
          className="flex flex-wrap gap-2"
          onClick={() => setIsOpen(!isOpen)}
        >
          {selected.length === 0 ? (
            <span className="text-gray-500">{placeholder}</span>
          ) : (
            selected.map(option => (
              <span
                key={option}
                className="inline-flex items-center gap-1 bg-blue-100 text-blue-800 text-sm px-2 py-1 rounded-full"
              >
                {option}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeOption(option);
                  }}
                  className="text-blue-600 hover:text-blue-800"
                >
                  ×
                </button>
              </span>
            ))
          )}
        </div>
      </div>

      {isOpen && (
        <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-y-auto">
          {options.length === 0 ? (
            <div className="px-3 py-2 text-gray-500">No options available</div>
          ) : (
            options.map(option => (
              <div
                key={option}
                className={`px-3 py-2 cursor-pointer hover:bg-gray-100 ${
                  selected.includes(option) ? 'bg-blue-50' : ''
                }`}
                onClick={() => toggleOption(option)}
              >
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    checked={selected.includes(option)}
                    onChange={() => {}}
                    className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 mr-2"
                  />
                  <span>{option}</span>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default MultiSelect;