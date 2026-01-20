-- ============================================================================
-- Function: get_employees_by_role
-- Returns employees who have worked in a specific role recently
-- Used by Report Card Viewer to populate employee dropdowns
-- ============================================================================

CREATE OR REPLACE FUNCTION get_employees_by_role(
    p_role TEXT,
    p_start_date DATE DEFAULT (CURRENT_DATE - INTERVAL '30 days')::DATE
)
RETURNS TABLE (
    user_id BIGINT,
    first_name TEXT,
    last_name TEXT,
    store_number INTEGER,
    invoice_count BIGINT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT DISTINCT
        e.user_id,
        e.first_name::TEXT,
        e.last_name::TEXT,
        COALESCE(
            -- Get most common store for this employee
            (SELECT iur.store_number 
             FROM invoice_user_roles iur 
             WHERE iur.user_id = e.user_id 
               AND iur.invoice_date >= p_start_date
             GROUP BY iur.store_number 
             ORDER BY COUNT(*) DESC 
             LIMIT 1),
            -- Fallback to store from username
            NULLIF(REGEXP_REPLACE(u.user_name, '[^0-9]', '', 'g'), '')::INTEGER
        ) as store_number,
        COUNT(DISTINCT iur.invoice_number) as invoice_count
    FROM employees e
    JOIN invoice_user_roles iur ON e.user_id = iur.user_id
    LEFT JOIN users u ON e.user_id = u.user_id
    WHERE e.active_flag = true
      AND iur.user_role = p_role
      AND iur.invoice_date >= p_start_date
    GROUP BY e.user_id, e.first_name, e.last_name, u.user_name
    HAVING COUNT(DISTINCT iur.invoice_number) >= 1
    ORDER BY e.last_name, e.first_name;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION get_employees_by_role TO authenticated;

-- ============================================================================
-- Function: get_managers_list  
-- Returns managers for the manager report dropdown
-- ============================================================================

CREATE OR REPLACE FUNCTION get_managers_list()
RETURNS TABLE (
    user_id BIGINT,
    first_name TEXT,
    last_name TEXT,
    store_number INTEGER,
    title TEXT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        e.user_id,
        e.first_name::TEXT,
        e.last_name::TEXT,
        NULLIF(REGEXP_REPLACE(u.user_name, '[^0-9]', '', 'g'), '')::INTEGER as store_number,
        cu.title::TEXT
    FROM employees e
    LEFT JOIN users u ON e.user_id = u.user_id
    LEFT JOIN connecteam_users cu ON e.employee_id = cu.employee_id
    WHERE e.active_flag = true
      AND (
          cu.title ILIKE '%manager%'
          OR cu.title ILIKE '%gm%'
          OR e.first_name || ' ' || e.last_name IN (
              'Gene Cantrell', 'John Shutt', 'Sean Porcher', 'Christin Byrd', 'Michelle May'
          )
      )
    ORDER BY e.last_name, e.first_name;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION get_managers_list TO authenticated;
