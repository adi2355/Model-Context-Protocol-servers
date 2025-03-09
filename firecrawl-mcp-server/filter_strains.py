import pandas as pd
import numpy as np
import os

def filter_incomplete_strains(input_file, output_file, min_fields=3):
    """
    Filter out incomplete strain entries from a CSV file.
    
    Parameters:
    - input_file: Path to the input CSV file
    - output_file: Path to save the filtered CSV 
    - min_fields: Minimum number of non-empty fields required in critical columns
    """
    print(f"Reading data from: {input_file}")
    
    # Read the CSV file
    df = pd.read_csv(input_file)
    
    # Count total strains before filtering
    total_strains = len(df)
    print(f"Total strains before filtering: {total_strains}")
    
    # Critical columns that should have values
    critical_columns = [
        'thc_percent', 'average_rating', 'rating_count', 
        'effects', 'medical', 'flavors', 'description'
    ]
    
    # Handle NaN values in string columns
    string_columns = ['effects', 'medical', 'flavors', 'description']
    for col in string_columns:
        df[col] = df[col].fillna('')
    
    # Count non-empty values in critical columns
    df['critical_field_count'] = 0
    for col in critical_columns:
        if col in string_columns:
            df['critical_field_count'] += (df[col] != '').astype(int)
        else:
            df['critical_field_count'] += df[col].notna().astype(int)
    
    # Create a boolean mask for filtering
    mask = (
        # Must have THC value OR CBD value
        (df['thc_percent'].notna() | df['cbd_percent'].notna()) &
        # Must have at least some effects, medical uses, or flavors
        ((df['effects'] != '') | (df['medical'] != '') | (df['flavors'] != '')) &
        # Must have a description
        (df['description'] != '') &
        # Must have at least min_fields critical fields with values
        (df['critical_field_count'] >= min_fields)
    )
    
    # Apply the filter
    filtered_df = df[mask].drop(columns=['critical_field_count'])
    
    # Count total strains after filtering
    filtered_count = len(filtered_df)
    removed_count = total_strains - filtered_count
    
    print(f"Strains kept: {filtered_count} ({filtered_count/total_strains:.1%})")
    print(f"Strains removed: {removed_count} ({removed_count/total_strains:.1%})")
    
    # Save the filtered data
    filtered_df.to_csv(output_file, index=False)
    print(f"Filtered data saved to {output_file}")
    
    # Generate detailed statistics about remaining data
    stats = {
        'total_strains': total_strains,
        'kept_strains': filtered_count,
        'removed_strains': removed_count,
        'kept_percentage': filtered_count/total_strains,
        'examples_removed': df[~mask]['name'].head(10).tolist(),
        'field_completeness': {}
    }
    
    # Calculate completeness of each field in the filtered dataset
    for column in df.columns:
        if column == 'critical_field_count':
            continue
            
        if column in string_columns:
            non_empty = (filtered_df[column] != '').sum()
        else:
            non_empty = filtered_df[column].notna().sum()
            
        stats['field_completeness'][column] = {
            'count': non_empty,
            'percentage': non_empty / filtered_count
        }
    
    return stats

# Path configuration
input_file = 'processed-data/standardized-strains.csv'
output_file = 'processed-data/filtered-strains.csv'
stats_file = 'processed-data/filtering-stats.txt'

# Example usage
if __name__ == "__main__":
    # Make sure output directory exists
    os.makedirs(os.path.dirname(output_file), exist_ok=True)
    
    # Run filtering
    print("\n🔍 FILTERING INCOMPLETE STRAIN DATA")
    print("===================================")
    stats = filter_incomplete_strains(input_file, output_file, min_fields=3)
    
    # Output more detailed statistics
    print("\n📊 FIELD COMPLETENESS IN FILTERED DATASET")
    print("=======================================")
    for field, values in stats['field_completeness'].items():
        print(f"{field}: {values['count']} records ({values['percentage']:.1%})")
    
    print("\n❌ EXAMPLES OF REMOVED STRAINS")
    print("============================")
    for strain in stats['examples_removed']:
        print(f"- {strain}")
    
    # Save statistics to file
    with open(stats_file, 'w') as f:
        f.write(f"STRAIN DATA FILTERING STATISTICS\n")
        f.write(f"==============================\n\n")
        f.write(f"Total strains before filtering: {stats['total_strains']}\n")
        f.write(f"Strains kept: {stats['kept_strains']} ({stats['kept_percentage']:.1%})\n")
        f.write(f"Strains removed: {stats['removed_strains']} ({1-stats['kept_percentage']:.1%})\n\n")
        
        f.write(f"FIELD COMPLETENESS IN FILTERED DATASET\n")
        f.write(f"-------------------------------------\n")
        for field, values in stats['field_completeness'].items():
            f.write(f"{field}: {values['count']} records ({values['percentage']:.1%})\n")
        
        f.write(f"\nEXAMPLES OF REMOVED STRAINS\n")
        f.write(f"---------------------------\n")
        for strain in stats['examples_removed']:
            f.write(f"- {strain}\n")
    
    print(f"\n✅ Complete filtering statistics saved to {stats_file}")
    print(f"✅ Filtered data saved to {output_file}") 