'use client';

import { useState, useRef, useEffect, KeyboardEvent } from 'react';

interface MultiSelectProps {
  options: string[];
  selected: string[];
  onChange: (selected: string[]) => void;
  placeholder?: string;
  label?: string;
  creatable?: boolean;
  onCreateOption?: (value: string) => void;
  disabled?: boolean;
}

function MultiSelect({ options, selected, onChange, placeholder = "Select options...", label, creatable, onCreateOption, disabled }: MultiSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setInputValue('');
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

  const createOption = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    const lower = trimmed.toLowerCase();
    const existingOption = options.find(o => o.toLowerCase() === lower);
    if (existingOption) {
      if (!selected.includes(existingOption)) {
        toggleOption(existingOption);
      }
    } else if (!selected.some(s => s.toLowerCase() === lower)) {
      if (onCreateOption) {
        onCreateOption(trimmed);
      }
      onChange([...selected, trimmed]);
    }
    setInputValue('');
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (creatable && inputValue.trim()) {
        createOption(inputValue);
      } else if (isOpen) {
        const filtered = filteredOptions;
        if (filtered.length > 0) {
          toggleOption(filtered[0]);
        }
      }
    } else if (e.key === 'Backspace' && inputValue === '' && selected.length > 0) {
      removeOption(selected[selected.length - 1]);
    } else if (e.key === ',' && creatable && inputValue.trim()) {
      e.preventDefault();
      createOption(inputValue);
    } else if (e.key === 'Escape') {
      setIsOpen(false);
      setInputValue('');
    } else if (e.key === 'ArrowDown' && !isOpen) {
      setIsOpen(true);
    }
  };

  const filteredOptions = options.filter(
    o => !selected.some(s => s.toLowerCase() === o.toLowerCase())
      && o.toLowerCase().includes(inputValue.toLowerCase())
  );

  const showCreateTip = creatable && inputValue.trim() && !options.some(
    o => o.toLowerCase() === inputValue.trim().toLowerCase()
  );

  return (
    <div className="relative" ref={dropdownRef}>
      {label && (
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {label}
        </label>
      )}

      <div
        className={`min-h-10 px-3 py-2 border border-gray-300 rounded-md focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 text-gray-900 bg-white ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
        onClick={() => {
          if (!disabled) {
            setIsOpen(true);
            inputRef.current?.focus();
          }
        }}
      >
        <div className="flex flex-wrap gap-2 items-center">
          {selected.map(option => (
            <span
              key={option}
              className="inline-flex items-center gap-1 bg-blue-100 text-blue-800 text-sm px-2 py-0.5 rounded-full"
            >
              {option}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (!disabled) removeOption(option);
                }}
                className="flex items-center cursor-pointer text-blue-600 hover:text-blue-800 leading-none"
                tabIndex={-1}
              >
                ×
              </button>
            </span>
          ))}
          {!disabled && (
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => {
                setInputValue(e.target.value);
                if (!isOpen) setIsOpen(true);
              }}
              onKeyDown={handleKeyDown}
              onFocus={() => setIsOpen(true)}
              placeholder={selected.length === 0 ? placeholder : ''}
              className="flex-1 min-w-[120px] outline-none bg-transparent text-sm"
            />
          )}
        </div>
      </div>

      {isOpen && !disabled && (
        <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-y-auto">
          {showCreateTip && (
            <div
              className="px-3 py-2 cursor-pointer hover:bg-blue-50 text-blue-700 border-b border-gray-100"
              onClick={() => createOption(inputValue)}
            >
              <span className="font-medium">+ Create "{inputValue.trim()}"</span>
            </div>
          )}
          {filteredOptions.length === 0 && !showCreateTip ? (
            <div className="px-3 py-2 text-gray-500">
              {creatable ? 'Start typing to add an option' : 'No options available'}
            </div>
          ) : (
            filteredOptions.map(option => (
              <div
                key={option}
                className={`px-3 py-2 cursor-pointer hover:bg-gray-100 ${selected.includes(option) ? 'bg-blue-50' : ''
                  }`}
                onClick={() => toggleOption(option)}
              >
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    checked={selected.includes(option)}
                    onChange={() => { }}
                    className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 mr-2"
                  />
                  <span className='text-gray-800'>{option}</span>
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
